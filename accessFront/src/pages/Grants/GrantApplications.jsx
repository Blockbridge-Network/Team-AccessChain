import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';
import {
  Box,
  Container,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  Alert,
  AlertIcon,
  useToast,
  Flex,
  Card,
  CardBody,
  Divider,
  useColorModeValue,
  Tag,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Link,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ViewIcon, CheckIcon, CloseIcon } from '@chakra-ui/icons';
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from '../../config/contracts';
import { useNGOAccessControl } from '../../hooks/useNGOAccessControl';
import { useGrantManagement } from '../../hooks/useGrantManagement';
import { sonicBlaze } from '../../config/chains';
import GrantReviewPanel from '../../components/GrantReviewPanel';
import { FaCheck, FaTimes, FaArrowLeft } from 'react-icons/fa';
import { toast } from 'react-toastify';

const GrantApplications = () => {
  const { grantId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isAuthorized, isLoadingAuthorization } = useNGOAccessControl();
  
  // Use Grant Management hook
  const { 
    grants, 
    approveApplication, 
    rejectApplication, 
    isAuthorizedNGO,
    isPending,
    isSuccess,
    error,
    isTransactionLoading,
    getGrantApplications,
  } = useGrantManagement();

  const [loading, setLoading] = useState(true);
  const [grantData, setGrantData] = useState(null);
  const [applications, setApplications] = useState([]);
  const [isGrantCreator, setIsGrantCreator] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [processingAction, setProcessingAction] = useState(false);

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const headerBg = useColorModeValue('blue.50', 'blue.900');

  // Fetch grant data and applications
  useEffect(() => {
    const fetchGrantData = async () => {
      if (!publicClient || !grantId || !isConnected) return;
      
      try {
        setLoading(true);
        
        // Get grant details
        const grantData = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.accessGrant,
          abi: CONTRACT_ABIS.accessGrant,
          functionName: 'grants',
          args: [grantId]
        });
        
        // Check if user is the grant creator
        const isCreator = grantData.ngo.toLowerCase() === address?.toLowerCase();
        setIsGrantCreator(isCreator);
        
        if (!isCreator && !isLoadingAuthorization && !isAuthorizedNGO) {
          toast({
            title: 'Access Denied',
            description: 'Only the grant creator can view applications',
            status: 'error',
            duration: 5000,
            isClosable: true
          });
          navigate('/ngo-dashboard');
          return;
        }
        
        // Format grant data
        const formattedGrant = {
          id: Number(grantId),
          title: grantData.title || 'Unnamed Grant',
          description: grantData.description || 'No description',
          amount: grantData.amount ? ethers.formatEther(grantData.amount.toString()) : '0',
          deadline: grantData.deadline ? new Date(Number(grantData.deadline) * 1000).toLocaleDateString() : 'No deadline',
          ngo: grantData.ngo,
          isActive: grantData.isActive || false
        };
        
        setGrantData(formattedGrant);
        
        // Fetch applications
        const applicationsData = await getGrantApplications(grantId);
        
        setApplications(applicationsData.map(app => ({
          id: app.id.toString(),
          applicant: app.applicant,
          proposal: app.proposal,
          status: app.status,
          submittedAt: new Date(Number(app.submittedAt) * 1000).toLocaleDateString(),
        })));
      } catch (error) {
        console.error('Error fetching grant data:', error);
        toast({
          title: 'Error loading grant',
          description: error.message || 'Could not load grant data',
          status: 'error',
          duration: 5000,
          isClosable: true
        });
      } finally {
        setLoading(false);
      }
    };

    fetchGrantData();
    
    // Set up event listeners for application events
    if (publicClient) {
      try {
        const unwatchSubmitted = publicClient.watchContractEvent({
          address: CONTRACT_ADDRESSES.accessGrant,
          abi: CONTRACT_ABIS.accessGrant,
          eventName: 'ApplicationSubmitted',
          onLogs: (logs) => {
            const eventLog = logs[0];
            if (eventLog && Number(eventLog.args.grantId) === parseInt(grantId, 10)) {
              fetchGrantData(); // Refresh applications when a new one is submitted
            }
          }
        });
        
        return () => {
          unwatchSubmitted?.();
        };
      } catch (error) {
        console.error('Error setting up event watchers:', error);
      }
    }
  }, [publicClient, grantId, address, isConnected, navigate, toast, isAuthorizedNGO, isLoadingAuthorization]);

  // Watch for transaction status changes
  useEffect(() => {
    if (isSuccess) {
      toast({
        title: 'Transaction Successful',
        description: 'The application status has been updated',
        status: 'success',
        duration: 5000,
        isClosable: true
      });
      onClose(); // Close the modal if open
    }
    
    if (error) {
      toast({
        title: 'Transaction Failed',
        description: error.message || 'There was an error processing your request',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  }, [isSuccess, error, toast, onClose]);

  // Handle application approval
  const handleApprove = async (applicationId) => {
    if (!isGrantCreator) {
      toast({
        title: 'Access Denied',
        description: 'Only the grant creator can approve applications',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }
    
    try {
      setProcessingAction(true);
      await approveApplication(Number(grantId), applicationId);
      toast.success('Application approved successfully');
      // Refresh applications
      const updatedApplications = await getGrantApplications(Number(grantId));
      setApplications(updatedApplications);
    } catch (error) {
      console.error('Error approving application:', error);
      toast.error(error.message || 'Failed to approve application');
    } finally {
      setProcessingAction(false);
    }
  };

  // Handle application rejection
  const handleReject = async (applicationId) => {
    if (!isGrantCreator) {
      toast({
        title: 'Access Denied',
        description: 'Only the grant creator can reject applications',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }
    
    try {
      setProcessingAction(true);
      await rejectApplication(Number(grantId), applicationId);
      toast.success('Application rejected successfully');
      // Refresh applications
      const updatedApplications = await getGrantApplications(Number(grantId));
      setApplications(updatedApplications);
    } catch (error) {
      console.error('Error rejecting application:', error);
      toast.error(error.message || 'Failed to reject application');
    } finally {
      setProcessingAction(false);
    }
  };

  // View application details
  const handleViewApplication = (app) => {
    setSelectedApplication(app);
    onOpen();
  };

  // Show loading state
  if (loading) {
    return (
      <Container maxW="6xl" py={10} centerContent>
        <Spinner size="xl" />
        <Text mt={4}>Loading grant applications...</Text>
      </Container>
    );
  }

  if (!isGrantCreator) {
    return (
      <Container maxW="6xl" py={10}>
        <Alert status="error">
          <AlertIcon />
          You do not have permission to view this page.
        </Alert>
        <Button mt={4} onClick={() => navigate('/ngo-dashboard')} leftIcon={<ChevronLeftIcon />}>
          Return to Dashboard
        </Button>
      </Container>
    );
  }

  // Render application status badge
  const getStatusBadge = (status) => {
    const colors = {
      pending: 'yellow',
      approved: 'green',
      rejected: 'red'
    };
    return <Badge colorScheme={colors[status]}>{status.toUpperCase()}</Badge>;
  };

  // Parse JSON application data for display
  const parseApplicationData = (jsonString) => {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('Error parsing application JSON:', error);
      return { error: 'Invalid application data' };
    }
  };

  return (
    <Container maxW="6xl" py={8}>
      <Button 
        mb={6} 
        leftIcon={<ChevronLeftIcon />}
        onClick={() => navigate('/ngo-dashboard')}
        variant="outline"
      >
        Back to Dashboard
      </Button>
      
      {grantData && (
        <Box mb={8}>
          <Heading size="lg" mb={2}>{grantData.title}</Heading>
          <HStack spacing={4} mb={4}>
            <Tag size="md" variant="solid" colorScheme="blue">
              {grantData.amount} SONIC
            </Tag>
            <Tag size="md" variant="subtle" colorScheme="gray">
              Deadline: {grantData.deadline}
            </Tag>
            <Badge colorScheme={grantData.isActive ? 'green' : 'red'}>
              {grantData.isActive ? 'Active' : 'Closed'}
            </Badge>
          </HStack>
          <Text color="gray.600">{grantData.description}</Text>
        </Box>
      )}
      
      <Box mb={6}>
        <Heading size="md" mb={4}>Applications ({applications.length})</Heading>
        
        {applications.length === 0 ? (
          <Alert status="info">
            <AlertIcon />
            No applications have been submitted for this grant yet.
          </Alert>
        ) : (
          <VStack spacing={4} align="stretch">
            {applications.map(app => {
              const appData = parseApplicationData(app.proposal);
              return (
                <Card 
                  key={app.id} 
                  bg={cardBg} 
                  borderWidth="1px" 
                  borderColor={borderColor}
                  borderRadius="lg"
                  overflow="hidden"
                >
                  <CardBody>
                    <Flex justify="space-between" align="center" mb={3}>
                      <Heading size="sm">{appData.projectTitle || 'Untitled Project'}</Heading>
                      {getStatusBadge(app.status)}
                    </Flex>
                    <Text noOfLines={2} mb={3}>
                      {appData.projectSummary || 'No summary provided'}
                    </Text>
                    <HStack spacing={2} mb={3}>
                      <Text fontSize="sm" fontWeight="bold">Applicant:</Text>
                      <Text fontSize="sm" fontFamily="mono">
                        {app.applicant.substring(0, 6)}...{app.applicant.substring(app.applicant.length - 4)}
                      </Text>
                    </HStack>
                    <HStack spacing={2}>
                      <Text fontSize="sm" fontWeight="bold">Beneficiaries:</Text>
                      <Text fontSize="sm">{appData.beneficiaryCount || 'Not specified'}</Text>
                    </HStack>
                    <Divider my={3} />
                    <HStack justify="space-between">
                      <Text fontSize="sm" color="gray.500">
                        Submitted: {app.submittedAt}
                        Submitted: {new Date(app.timestamp).toLocaleDateString()}
                      </Text>
                      <HStack spacing={2}>
                        <IconButton
                          icon={<ViewIcon />}
                          size="sm"
                          onClick={() => handleViewApplication(app)}
                          aria-label="View application"
                        />
                        {app.status === 'pending' && (
                          <>
                            <IconButton
                              icon={<FaCheck />}
                              size="sm"
                              colorScheme="green"
                              onClick={() => handleApprove(app.id)}
                              aria-label="Approve application"
                              isLoading={processingAction}
                              loadingText="Approving..."
                            />
                            <IconButton
                              icon={<FaTimes />}
                              size="sm"
                              colorScheme="red"
                              onClick={() => handleReject(app.id)}
                              aria-label="Reject application"
                              isLoading={processingAction}
                              loadingText="Rejecting..."
                            />
                          </>
                        )}
                      </HStack>
                    </HStack>
                  </CardBody>
                </Card>
              );
            })}
          </VStack>
        )}
      </Box>

      {/* Application Detail Modal */}
      {selectedApplication && (
        <Modal isOpen={isOpen} onClose={onClose} size="xl">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>
              {parseApplicationData(selectedApplication.proposalJson).projectTitle || 'Application Details'}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4} align="stretch">
                {(() => {
                  const appData = parseApplicationData(selectedApplication.proposalJson);
                  return Object.entries(appData).map(([key, value]) => (
                    <Box key={key}>
                      <Text fontWeight="bold" textTransform="capitalize">{key.replace(/([A-Z])/g, ' $1')}</Text>
                      <Text>{value}</Text>
                    </Box>
                  ));
                })()}
                
                <Divider my={2} />
                
                <HStack spacing={2}>
                  <Text fontWeight="bold">Status:</Text>
                  {getStatusBadge(selectedApplication.status)}
                </HStack>
                
                <HStack spacing={2}>
                  <Text fontWeight="bold">Applicant:</Text>
                  <Text fontFamily="mono">{selectedApplication.applicant}</Text>
                </HStack>
                
                <Text fontWeight="bold">Submitted On:</Text>
                  <Text>{new Date(selectedApplication.timestamp).toLocaleString()}</Text>
              </VStack>
            </ModalBody>
            
            <ModalFooter>
              {selectedApplication.status === 'pending' && (
                <>
                  <Button 
                    colorScheme="green" 
                    mr={3} 
                    onClick={() => handleApprove(selectedApplication.id)}
                    isLoading={processingAction}
                  >
                    Approve
                  </Button>
                  <Button 
                    colorScheme="red" 
                    mr={3}
                    onClick={() => handleReject(selectedApplication.id)}
                    isLoading={processingAction}
                  >
                    Reject
                  </Button>
                </>
              )}
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};

export default GrantApplications;